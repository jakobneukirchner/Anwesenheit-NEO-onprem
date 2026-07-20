import { unpackField } from '../../utils/crypto';

export interface EventLike {
  id: string;
  title: string;
  descriptionEnc: string | null;
  locationEnc: string | null;
  cancelReasonEnc: string | null;
  groupId: string;
  seriesId: string | null;
  startAt: Date;
  endAt: Date;
  mode: string;
  isCancelled: boolean;
  signupDeadline: Date | null;
  withdrawDeadline: Date | null;
  confirmationWindowMinutes: number | null;
  minParticipants: number;
  createdAt: Date;
}

/** Entschlüsselt die *Enc-Felder eines Events zu einem API-DTO. */
export async function serializeEvent(e: EventLike): Promise<Record<string, unknown>> {
  const [description, location, cancelReason] = await Promise.all([
    unpackField(e.descriptionEnc),
    unpackField(e.locationEnc),
    unpackField(e.cancelReasonEnc),
  ]);
  return {
    id: e.id,
    title: e.title,
    description,
    location,
    cancelReason,
    groupId: e.groupId,
    seriesId: e.seriesId,
    startAt: e.startAt,
    endAt: e.endAt,
    mode: e.mode,
    isCancelled: e.isCancelled,
    signupDeadline: e.signupDeadline,
    withdrawDeadline: e.withdrawDeadline,
    confirmationWindowMinutes: e.confirmationWindowMinutes,
    minParticipants: e.minParticipants,
    createdAt: e.createdAt,
  };
}

export async function serializeEvents(events: EventLike[]): Promise<Record<string, unknown>[]> {
  return Promise.all(events.map(serializeEvent));
}
