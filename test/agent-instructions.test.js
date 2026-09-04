import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const agents = read("AGENTS.md");
const claude = read("CLAUDE.md");

const skills = {
  deploy: read(".agents/skills/factupapa-deploy/SKILL.md"),
  audit: read(".agents/skills/factupapa-data-audit/SKILL.md"),
  close: read(".agents/skills/factupapa-monthly-close/SKILL.md"),
  quality: read(".agents/skills/factupapa-quality-sweep/SKILL.md"),
};

const commands = {
  deploy: read(".claude/commands/desplegar.md"),
  audit: read(".claude/commands/revisar-datos.md"),
  close: read(".claude/commands/cierre-mensual.md"),
  quality: read(".claude/commands/calidad-total.md"),
};

const qualityStandard = read("docs/quality/FACTUPAPA_QUALITY_STANDARD.md");
const qualityRolesIndex = read(".agents/roles/README.md");
const qualityRoles = {
  lead: read(".agents/roles/quality-lead.md"),
  ux: read(".agents/roles/product-ux.md"),
  visual: read(".agents/roles/visual-design.md"),
  mobile: read(".agents/roles/mobile-interaction-accessibility.md"),
  business: read(".agents/roles/business-functional-qa.md"),
  data: read(".agents/roles/data-sync-integrations.md"),
  architecture: read(".agents/roles/frontend-architecture-performance.md"),
  security: read(".agents/roles/security-privacy.md"),
  release: read(".agents/roles/release-regression.md"),
};

test("AGENTS.md keeps the canonical autonomy and approval contract", () => {
  assert.match(agents, /## Autonomy and approvals/);
  assert.match(agents, /### Explicit approval gates/);
  assert.match(agents, /## Completion contract/);
  assert.match(agents, /## Verification policy/);
  assert.match(agents, /## Git and deployment ownership/);
  assert.match(agents, /A request to \*\*review, inspect, investigate, audit, analyze, compare, or explain\*\* is read-only by default/);
  assert.match(agents, /deployed to production without a second confirmation/);
});

test("AGENTS.md stays comfortably below Codex's usual project-instruction budget", () => {
  assert.ok(
    Buffer.byteLength(agents, "utf8") < 32 * 1024,
    "Keep AGENTS.md below 32 KiB; move workflow detail into skills instead of growing the root file.",
  );
});

test("Claude guidance defers approval policy to AGENTS.md", () => {
  assert.match(claude, /Lee y aplica primero `AGENTS\.md`/);
  assert.match(claude, /No crea nuevas puertas de aprobación/);
  assert.doesNotMatch(claude, /tras CUALQUIER cambio verificado, ejecuta `\/desplegar`/);
  assert.doesNotMatch(claude, /si empieza un mes nuevo con datos, `\/cierre-mensual`/);
});

test("canonical project skills exist with stable names and safety boundaries", () => {
  assert.match(skills.deploy, /name: factupapa-deploy/);
  assert.match(skills.deploy, /Never claim production success without evidence/);

  assert.match(skills.audit, /name: factupapa-data-audit/);
  assert.match(skills.audit, /This skill is \*\*read-only\*\*/);
  assert.match(skills.audit, /Audit first; mutation is a separate authorized action/);

  assert.match(skills.close, /name: factupapa-monthly-close/);
  assert.match(skills.close, /\*\*Never send the email from this skill\.\*\*/);

  assert.match(skills.quality, /name: factupapa-quality-sweep/);
  assert.match(skills.quality, /Do not merely generate an audit report/);
  assert.match(skills.quality, /factupapa-deploy/);
});

test("Claude commands are thin adapters to canonical skills", () => {
  assert.match(commands.deploy, /\.agents\/skills\/factupapa-deploy\/SKILL\.md/);
  assert.match(commands.audit, /\.agents\/skills\/factupapa-data-audit\/SKILL\.md/);
  assert.match(commands.close, /\.agents\/skills\/factupapa-monthly-close\/SKILL\.md/);
  assert.match(commands.quality, /\.agents\/skills\/factupapa-quality-sweep\/SKILL\.md/);

  for (const command of Object.values(commands)) {
    assert.match(command, /no crea ninguna aprobación adicional/i);
  }
});

test("legacy stop-and-ask deployment traps are not reintroduced", () => {
  const deployText = `${agents}\n${skills.deploy}\n${commands.deploy}`;

  assert.doesNotMatch(deployText, /Si no hay cambios sin commitear, avisa y para/i);
  assert.doesNotMatch(deployText, /si estás en `main`, avisa antes/i);
  assert.doesNotMatch(deployText, /pide una etiqueta breve/i);
  assert.doesNotMatch(deployText, /until curl[^\n]+do sleep 8; done/i);
});

test("Factupapa comprehensive quality sweeps are wired into canonical policy", () => {
  assert.match(agents, /## Comprehensive quality sweeps/);
  assert.match(agents, /factupapa-quality-sweep\/SKILL\.md/);
  assert.match(agents, /do not stop at an audit report/i);
  assert.match(qualityStandard, /# Factupapa Quality Standard/);
  assert.match(qualityStandard, /WCAG 2\.2 AA/);
  assert.match(qualityStandard, /## Exit criteria for a full quality sweep/);
});

test("quality team contains all non-overlapping specialist lenses", () => {
  assert.equal(Object.keys(qualityRoles).length, 9);
  assert.match(qualityRoles.lead, /Quality Lead/);
  assert.match(qualityRoles.ux, /Product & UX/);
  assert.match(qualityRoles.visual, /Visual Design/);
  assert.match(qualityRoles.mobile, /Mobile Interaction & Accessibility/);
  assert.match(qualityRoles.business, /Business Functional QA/);
  assert.match(qualityRoles.data, /Data, Sync & Integrations/);
  assert.match(qualityRoles.architecture, /Frontend Architecture & Performance/);
  assert.match(qualityRoles.security, /Security & Privacy/);
  assert.match(qualityRoles.release, /Release & Regression/);
});

test("quality sweep preserves safety precedence over aesthetics", () => {
  const qualityText = `${skills.quality}\n${qualityStandard}\n${qualityRolesIndex}\n${Object.values(qualityRoles).join("\n")}`;
  assert.match(qualityText, /security\/privacy > business\/data correctness > accessibility\/usability > product UX > performance\/maintainability > visual polish/);
  assert.match(qualityText, /do not weaken security or data safeguards for aesthetics/i);
  assert.match(qualityText, /destructive mutation of production business data remains subject to `AGENTS\.md` approval gates/i);
});
