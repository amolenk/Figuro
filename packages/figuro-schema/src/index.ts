/** Version 1 metadata stored under `element.customData.figuro`. */
export type FiguroMetadataV1 = {
  v: 1;
  step?: number;
  role?: string;
  [field: string]: unknown;
};

export type FiguroMetadataState =
  | { kind: "unannotated" }
  | { kind: "v1"; metadata: FiguroMetadataV1 }
  | { kind: "opaque" };

/** Whether an object declares v1; validate known field values separately. */
export function isFiguroMetadataV1(value: unknown): value is FiguroMetadataV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "v" in value &&
    value.v === 1
  );
}

/** Classifies metadata without interpreting unsupported or malformed values. */
export function inspectFiguroMetadata(value: unknown): FiguroMetadataState {
  if (value === undefined) return { kind: "unannotated" };
  if (isFiguroMetadataV1(value)) return { kind: "v1", metadata: value };
  return { kind: "opaque" };
}

/** Whether a number is a representable non-negative reveal step. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Whether the recognized v1 fields conform to their declared value types. */
export function isValidFiguroMetadataV1(value: unknown): value is FiguroMetadataV1 {
  return (
    isFiguroMetadataV1(value) &&
    (!("step" in value) || isNonNegativeInteger(value.step)) &&
    (!("role" in value) || typeof value.role === "string")
  );
}
