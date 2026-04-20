export type QuantReadableStreamLike = ReadableStream<Uint8Array> | NodeJS.ReadableStream;
export type QuantWritableSink = NodeJS.WritableStream;

export interface QuantSpawnedProcess {
  readonly stdin?: number | QuantWritableSink;
  readonly stdout?: number | QuantReadableStreamLike;
  readonly stderr?: number | QuantReadableStreamLike;
  readonly exited: Promise<number>;
  kill(signal?: string): void;
}

export interface QuantSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin: "pipe";
  stdout: "pipe";
  stderr: "pipe";
}

export type QuantSpawnImpl = (cmd: string[], options: QuantSpawnOptions) => QuantSpawnedProcess;

function adaptBunProcess(proc: ReturnType<typeof Bun.spawn>): QuantSpawnedProcess {
  return {
    get stdin() {
      return proc.stdin as unknown as QuantWritableSink | undefined;
    },
    get stdout() {
      return proc.stdout as QuantReadableStreamLike | undefined;
    },
    get stderr() {
      return proc.stderr as QuantReadableStreamLike | undefined;
    },
    get exited() {
      return proc.exited;
    },
    kill(signal?: string) {
      proc.kill(signal === "SIGTERM" ? 15 : undefined);
    },
  };
}

export function resolveQuantSpawnImpl(): QuantSpawnImpl {
  return (cmd, options) => adaptBunProcess(Bun.spawn(cmd, options));
}
