import type { AlertKind, VisitTone } from "@shared/types";

export const ALERT_COLOR: Record<AlertKind, string> = {
  overdue: "#b42318",
  today: "#1d4e89",
  soon: "#b45309",
};

export const TONE_COLOR: Record<VisitTone, string> = {
  none: "#5f6b7a",
  recent: "#157347",
  normal: "#1d4e89",
  warning: "#c2410c",
  old: "#b42318",
};
