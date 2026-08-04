import type {
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

const escapeData = (value: string) =>
  value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

const escapeProperty = (value: string) =>
  escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");

export default class GitHubAnnotationsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === test.expectedStatus) return;
    const error = result.error?.message ?? `Estado inesperado: ${result.status}`;
    const title = `Playwright: ${test.title}`;
    console.log(
      `::error file=${escapeProperty(test.location.file)},line=${test.location.line},title=${escapeProperty(title)}::${escapeData(error)}`,
    );
  }
}
