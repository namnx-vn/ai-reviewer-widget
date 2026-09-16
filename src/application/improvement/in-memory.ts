import type { LearningEvent, LearningPersistencePort } from "./contracts";
import { assertLearningEvent } from "./validation";

export function createInMemoryLearningStore(initial: readonly LearningEvent[] = []): LearningPersistencePort {
  let events = structuredClone(initial);
  return {
    async read() { return { revision: events.length, events: structuredClone(events) }; },
    async append(event, expectedRevision) {
      assertLearningEvent(event);
      if (expectedRevision !== events.length) throw new Error("Learning store revision conflict.");
      if (events.some((existing) => existing.eventId === event.eventId)) throw new Error("Learning event already exists.");
      events = [...events, structuredClone(event)];
    },
  };
}
