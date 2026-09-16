import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseLearningEvent, type LearningPersistencePort, type LearningStoreSnapshot } from "../application/improvement";

// Immutable event files plus an exclusive writer lock keep independent operator processes from
// accepting the same revision. A crashed writer leaves a lock that needs operator investigation.
export function createFileLearningStore(directory: string): LearningPersistencePort {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const read = (): LearningStoreSnapshot => {
    const files = readdirSync(root).filter((name) => /^\d{12}\.json$/.test(name)).sort();
    const events = files.map((name, index) => {
      if (name !== `${String(index + 1).padStart(12, "0")}.json`) throw new Error("Learning journal revision gap.");
      const value: unknown = JSON.parse(readFileSync(resolve(root, name), "utf8"));
      return parseLearningEvent(value);
    });
    if (new Set(events.map((event) => event.eventId)).size !== events.length) throw new Error("Duplicate learning journal identity.");
    return { revision: events.length, events };
  };
  return {
    async read() { return read(); },
    async append(input, expectedRevision) {
      const event = parseLearningEvent(input);
      const lock = resolve(root, ".writer-lock");
      mkdirSync(lock, { mode: 0o700 });
      const temporary = resolve(root, ".pending-event");
      try {
        const snapshot = read();
        if (snapshot.revision !== expectedRevision) throw new Error("Learning store revision conflict.");
        if (snapshot.events.some((existing) => existing.eventId === event.eventId)) throw new Error("Learning event already exists.");
        const destination = resolve(root, `${String(expectedRevision + 1).padStart(12, "0")}.json`);
        if (existsSync(destination)) throw new Error("Learning revision already exists.");
        rmSync(temporary, { force: true });
        const descriptor = openSync(temporary, "wx", 0o600);
        try { writeFileSync(descriptor, JSON.stringify(event)); fsyncSync(descriptor); } finally { closeSync(descriptor); }
        renameSync(temporary, destination);
        const directoryDescriptor = openSync(root, "r");
        try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
      } finally {
        rmSync(temporary, { force: true }); rmSync(lock, { recursive: true });
      }
    },
  };
}
