import { resolveQuantCli } from "./resolve-cli.js";
import {
  type QuantReadableStreamLike,
  type QuantSpawnedProcess,
  type QuantSpawnImpl,
  type QuantWritableSink,
  resolveQuantSpawnImpl,
} from "./spawn.js";

export class QuantCliError extends Error {
  readonly command: string[];
  readonly exitCode?: number;
  readonly stderr: string;

  constructor(message: string, options: { command: string[]; exitCode?: number; stderr?: string }) {
    super(message);
    this.name = "QuantCliError";
    this.command = options.command;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr ?? "";
  }
}

export interface RunQuantCliOptions {
  subcommand: string[];
  input: unknown;
  timeoutMs?: number;
  cliCommand?: string[];
  cwd?: string;
  spawnImpl?: QuantSpawnImpl;
}

export interface QuantCliInvocationResult {
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface StreamCollector {
  getText(): string;
  promise: Promise<string>;
}

function isWebReadableStream(
  stream: QuantReadableStreamLike,
): stream is ReadableStream<Uint8Array> {
  return typeof (stream as ReadableStream<Uint8Array>).getReader === "function";
}

function collectNodeStream(stream: NodeJS.ReadableStream): StreamCollector {
  const decoder = new TextDecoder();
  let text = "";

  const promise = new Promise<string>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("close", onClose);
      stream.removeListener("error", onError);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      text += decoder.decode();
      resolve(text);
    };

    const onData = (chunk: string | Uint8Array) => {
      if (typeof chunk === "string") {
        text += chunk;
        return;
      }
      text += decoder.decode(chunk, { stream: true });
    };

    const onEnd = () => finish();
    const onClose = () => finish();
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("close", onClose);
    stream.once("error", onError);
  });

  return {
    getText: () => text,
    promise,
  };
}

function collectStream(stream: QuantReadableStreamLike | undefined | null): StreamCollector {
  if (!stream) {
    return {
      getText: () => "",
      promise: Promise.resolve(""),
    };
  }

  if (!isWebReadableStream(stream)) {
    return collectNodeStream(stream);
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const promise = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        text += decoder.decode(value, { stream: true });
      }
    }
    text += decoder.decode();
    return text;
  })();

  return {
    getText: () => text,
    promise,
  };
}

function asReadableStream(
  stream: number | QuantReadableStreamLike | undefined,
): QuantReadableStreamLike | undefined {
  if (typeof stream === "number") return undefined;
  return stream;
}

function asWritableSink(
  stream: number | QuantWritableSink | undefined,
): QuantWritableSink | undefined {
  if (typeof stream === "number") return undefined;
  return stream;
}

export async function runQuantCli(options: RunQuantCliOptions): Promise<QuantCliInvocationResult> {
  const command = [...(options.cliCommand ?? resolveQuantCli()), ...options.subcommand];
  const timeoutMs = options.timeoutMs ?? 300_000;
  const spawnImpl = options.spawnImpl ?? resolveQuantSpawnImpl();
  const input = JSON.stringify(options.input);

  let proc: QuantSpawnedProcess;
  try {
    proc = spawnImpl(command, {
      cwd: options.cwd,
      env: process.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdin = asWritableSink(proc.stdin);
    stdin?.write(input);
    stdin?.end();
  } catch (error) {
    throw new QuantCliError("Failed to start quant CLI.", {
      command,
      stderr: error instanceof Error ? error.message : String(error),
    });
  }

  const stdoutCollector = collectStream(asReadableStream(proc.stdout));
  const stderrCollector = collectStream(asReadableStream(proc.stderr));
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const exitOutcome = await Promise.race([
    proc.exited.then(
      (code) => ({ type: "exit" as const, code }),
      (error) => ({ type: "error" as const, error }),
    ),
    new Promise<{ type: "timeout" }>((resolve) => {
      timeoutId = setTimeout(() => resolve({ type: "timeout" as const }), timeoutMs);
    }),
  ]);

  if (timeoutId) clearTimeout(timeoutId);

  if (exitOutcome.type === "timeout") {
    proc.kill("SIGTERM");
    await proc.exited.catch(() => undefined);
    await Promise.allSettled([stdoutCollector.promise, stderrCollector.promise]);
    throw new QuantCliError(`Quant CLI timed out after ${timeoutMs}ms.`, {
      command,
      stderr: stderrCollector.getText(),
    });
  }

  if (exitOutcome.type === "error") {
    await Promise.allSettled([stdoutCollector.promise, stderrCollector.promise]);
    throw new QuantCliError("Quant CLI failed before completion.", {
      command,
      stderr:
        stderrCollector.getText() ||
        (exitOutcome.error instanceof Error
          ? exitOutcome.error.message
          : String(exitOutcome.error)),
    });
  }

  const exitCode = exitOutcome.code;
  const [stdout, stderr] = await Promise.all([stdoutCollector.promise, stderrCollector.promise]);

  if (exitCode == null) {
    throw new QuantCliError("Quant CLI exited without an exit code.", {
      command,
      stderr,
    });
  }

  if (exitCode !== 0) {
    throw new QuantCliError(`Quant CLI exited with code ${exitCode}.`, {
      command,
      exitCode,
      stderr,
    });
  }

  return {
    command,
    stdout,
    stderr,
    exitCode,
  };
}
