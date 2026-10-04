import type { Place, TransitRoute, TransportConfig } from "../types";

export function normalizeSearchText(value: unknown): string;
export function matchesPlace(place: Place, query: string): boolean;
export function searchPlaces(places: Place[], query: string, limit?: number): Place[];
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number;
export function estimateDriving(
  origin: [number, number],
  destination: [number, number],
  config: TransportConfig,
): {
  directKm: number;
  adjustedKm: number;
  minutes: number;
  method: string;
};

export type TransitStep =
  | {
      mode: "步行";
      from: string;
      to: string;
      minutes: number;
      distanceKm: number;
    }
  | {
      mode: "轨道交通";
      line: string;
      from: string;
      to: string;
      minutes: number;
      stops: number;
    };

export function buildTransitPlan(
  origin: [number, number],
  destination: [number, number],
  routes: TransitRoute[],
  config: TransportConfig,
): {
  totalMinutes: number;
  transfers: number;
  originWalkKm: number;
  destinationWalkKm: number;
  steps: TransitStep[];
} | null;

export function formatDuration(minutes: number): string;
