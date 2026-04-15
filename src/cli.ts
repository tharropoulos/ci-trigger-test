#!/usr/bin/env node

import { parseArgs } from "node:util";
import { runExtraction } from "./index.js";
import type { CliOptions } from "./types.js";

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const spec = await runExtraction(options);
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ event: "result", routes: spec.routes.length, diagnostics: spec.diagnostics.length })}\n`,
    );
  } else {
    process.stdout.write(
      `Extracted ${spec.routes.length} routes with ${spec.diagnostics.length} diagnostics.\n`,
    );
  }
}

function parseCli(argv: readonly string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      config: { type: "string" },
      output: { type: "string" },
      "base-url": { type: "string" },
      "max-call-depth": { type: "string" },
      "fail-on-unresolved": { type: "boolean" },
      verbose: { type: "boolean" },
      "debug-route": { type: "string" },
      json: { type: "boolean" },
    },
    strict: true,
  });

  if (positionals.length > 1) {
    throw new Error(`Unknown arguments: ${positionals.join(" ")}`);
  }
  if (positionals[0] !== undefined && positionals[0] !== "extract") {
    throw new Error(`Unknown argument: ${positionals[0]}`);
  }

  let maxCallDepth: number | undefined;
  if (values["max-call-depth"] !== undefined) {
    maxCallDepth = Number.parseInt(values["max-call-depth"], 10);
    if (!Number.isFinite(maxCallDepth)) {
      throw new Error(
        `Invalid value for --max-call-depth: ${values["max-call-depth"]}`,
      );
    }
  }

  return {
    command: "extract",
    configPath: values.config,
    outputPath: values.output,
    baseUrl: values["base-url"],
    maxCallDepth,
    failOnUnresolved: values["fail-on-unresolved"],
    verbose: values.verbose ?? false,
    debugRoute: values["debug-route"],
    json: values.json ?? false,
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
