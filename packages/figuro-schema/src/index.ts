/** Version 1 metadata stored under `element.customData.figuro`. */
export type FiguroMetadataV1 = {
  v: 1;
  step?: number;
  role?: string;
  [field: string]: unknown;
};

/** Whether a value is a recognized v1 object; optional fields stay extensible. */
export function isFiguroMetadataV1(value: unknown): value is FiguroMetadataV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "v" in value &&
    value.v === 1
  );
}

/** Whether a number is a representable non-negative reveal step. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
