# FactuPapa voice assistant

## Product contract

The voice assistant is a mobile-first command surface. It may prepare business actions, but it must not silently issue invoices, cancel documents, register payments, or perform other irreversible/accounting actions.

Initial supported command:

`Haz una factura para Bar Pepito con 100 kilos de patata y 10 lechugas`

Flow:

1. capture/transcribe the utterance;
2. resolve the customer and products against FactuPapa's authenticated company data;
3. use the effective customer/product price when one exists;
4. show a concrete preview with quantities and total;
5. require explicit confirmation;
6. create a **draft** invoice only;
7. navigate to the resulting invoice so the user can review/issue it normally.

Ambiguous customers/products or incompatible units must stop the action and ask for a more precise command. Never guess silently.

## Current lightweight stage

The web app includes a zero-API-cost browser speech-recognition fallback plus typed-command fallback. This lets the command/preview/confirmation tool layer be exercised without putting additional AI models on the current nearly-full VPS.

This browser recognition is deliberately isolated from the business-action layer. Replacing transcription does not change invoice resolution/execution.

## Target Pipecat stage after VPS migration

Use Pipecat as the realtime voice orchestration layer and `SmallWebRTCTransport` for the first self-hosted deployment. The browser should connect through the official Pipecat JS client/transport rather than exposing model/service secrets.

Recommended shape:

`FactuPapa PWA -> Pipecat Small WebRTC -> local/selected STT -> command/tool layer -> local/selected TTS -> PWA`

The Pipecat worker should authenticate sessions through FactuPapa's backend and receive only the minimum company/user context required for the current request. It must call constrained FactuPapa tools rather than writing to PostgreSQL directly.

The first production tools should be narrow and confirmation-aware:

- prepare invoice draft;
- inspect customer debt/balance;
- inspect recent invoice status;
- prepare a payment entry (confirmation required before posting).

STT/TTS engines remain swappable. The application must not couple business logic to a particular speech or LLM provider.
