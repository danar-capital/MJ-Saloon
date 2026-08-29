export type OperationalBookingStatus = "arrived" | "in_service" | "completed" | "cancelled" | "no_show";

export function bookingStatusTimingAllowed(
  status: OperationalBookingStatus,
  item: { bookingDate: string; startMinute: number; endMinute: number },
  now: { date: string; minutes: number },
) {
  if (status === "cancelled") return true;
  const beforeToday = item.bookingDate < now.date;
  const today = item.bookingDate === now.date;
  if (status === "arrived") return today && now.minutes >= item.startMinute - 60;
  if (status === "in_service") return beforeToday || (today && now.minutes >= item.startMinute);
  return beforeToday || (today && now.minutes >= item.endMinute);
}
