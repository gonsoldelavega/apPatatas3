import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Mic, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notesApi, type Note, type NoteAttachment } from "../api/workspace";
import { askConfirm, showNotice } from "../ui/dialogs";
import { blobToBase64, compressPhoto, formatDuration, MAX_RECORDING_SECONDS, pickAudioMime } from "./media";

/** Carga el archivo (necesita la sesión) y lo ofrece como URL temporal. */
function useAttachmentUrl(noteId: string, attachmentId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    notesApi
      .attachmentBlob(noteId, attachmentId)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [noteId, attachmentId]);
  return url;
}

function AttachmentItem({ noteId, attachment, onRemove }: { noteId: string; attachment: NoteAttachment; onRemove: () => void }) {
  const url = useAttachmentUrl(noteId, attachment.id);
  return (
    <li className={`note-media__item note-media__item--${attachment.kind}`}>
      {attachment.kind === "image" ? (
        url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Ver foto grande">
            <img src={url} alt={`Foto de ${attachment.createdByName}`} />
          </a>
        ) : (
          <span className="note-media__loading">Cargando foto…</span>
        )
      ) : (
        <div className="note-media__audio">
          <small>
            Nota de voz · {attachment.durationSeconds != null ? formatDuration(attachment.durationSeconds) : ""} · {attachment.createdByName}
          </small>
          {url ? <audio controls preload="none" src={url} /> : <span className="note-media__loading">Cargando audio…</span>}
        </div>
      )}
      <button type="button" className="note-media__delete" aria-label="Quitar este archivo" onClick={onRemove}>
        <Trash2 aria-hidden="true" />
      </button>
    </li>
  );
}

/** Fotos y notas de voz de una nota: ver, escuchar, añadir y quitar. */
export function NoteAttachments({ note }: { note: Note }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notes"] });
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const upload = useMutation({
    mutationFn: (input: { kind: "image" | "audio"; mimeType: string; data: string; durationSeconds?: number }) => notesApi.addAttachment(note.id, input),
    onSuccess: refresh,
    onError: () => void showNotice("No se pudo guardar el archivo. Inténtalo de nuevo."),
  });
  const remove = useMutation({
    mutationFn: (attachmentId: string) => notesApi.removeAttachment(note.id, attachmentId),
    onSuccess: refresh,
  });

  useEffect(
    () => () => {
      if (timer.current) window.clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      upload.mutate({ kind: "image", mimeType: "image/jpeg", data: await compressPhoto(file) });
    } catch {
      await showNotice("No se pudo preparar la foto.");
    }
  };

  const stop = () => {
    recorder.current?.stop();
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  const start = async () => {
    const mime = pickAudioMime((candidate) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate));
    if (!navigator.mediaDevices?.getUserMedia || !mime) {
      await showNotice("Este navegador no puede grabar notas de voz.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      await showNotice("No hay permiso para usar el micrófono. Actívalo en los ajustes del navegador.");
      return;
    }
    chunks.current = [];
    const media = new MediaRecorder(stream, { mimeType: mime });
    recorder.current = media;
    const startedAt = Date.now();
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    media.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      const blob = new Blob(chunks.current, { type: mime.split(";")[0] });
      if (blob.size === 0) return;
      upload.mutate({
        kind: "audio",
        mimeType: blob.type,
        data: await blobToBase64(blob),
        durationSeconds: Math.min(MAX_RECORDING_SECONDS, Math.round((Date.now() - startedAt) / 1000)),
      });
    };
    media.start();
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) stop();
    }, 500);
  };

  return (
    <div className="note-media">
      {note.attachments.length > 0 && (
        <ul className="note-media__list">
          {note.attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              noteId={note.id}
              attachment={attachment}
              onRemove={async () => {
                if (await askConfirm(attachment.kind === "image" ? "¿Quitar esta foto?" : "¿Quitar esta nota de voz?", { danger: true })) remove.mutate(attachment.id);
              }}
            />
          ))}
        </ul>
      )}
      <div className="note-media__tools">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            void onPhoto(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button type="button" className="order-btn" disabled={upload.isPending || recording} onClick={() => fileInput.current?.click()}>
          <Camera aria-hidden="true" /> Foto
        </button>
        {recording ? (
          <button type="button" className="order-btn note-media__rec" onClick={stop}>
            <Square aria-hidden="true" /> Parar · {formatDuration(seconds)}
          </button>
        ) : (
          <button type="button" className="order-btn" disabled={upload.isPending} onClick={() => void start()}>
            <Mic aria-hidden="true" /> Voz
          </button>
        )}
        {upload.isPending && <small>Guardando…</small>}
      </div>
    </div>
  );
}
