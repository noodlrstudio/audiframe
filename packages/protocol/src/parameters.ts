import { AudiframeError, type Parameter, type Json } from "./types";
import { assertSchema, arr } from "./schema";
import { parameterSchema } from "./operations";
export function validateParameters(descriptors: Parameter[]): void {
  assertSchema(arr(parameterSchema), descriptors);
  if (new Set(descriptors.map((p) => p.id)).size !== descriptors.length)
    throw new AudiframeError("INVALID_VALUE");
  for (const p of descriptors) {
    if (p.maxValue < p.minValue) throw new AudiframeError("INVALID_VALUE");
    validateParameter(p, p.defaultValue);
  }
}
export function validateParameter(p: Parameter, value: number): void {
  if (
    !Number.isFinite(value) ||
    value < p.minValue ||
    value > p.maxValue ||
    (p.type === "int" && !Number.isInteger(value)) ||
    (p.type === "bool" && value !== 0 && value !== 1) ||
    (p.type === "enum" && !p.choices?.some((c) => c.value === value))
  )
    throw new AudiframeError("INVALID_VALUE", "Parameter outside domain");
}
export function createParameterStore(
  descriptors: Parameter[],
  apply: (changes: { id: string; value: number }[]) => void | Promise<void>,
) {
  validateParameters(descriptors);
  const values = new Map(descriptors.map((p) => [p.id, p.defaultValue]));
  let revision = 0;
  const get = (ids: string[]) =>
    ids.map((id) => {
      if (!values.has(id)) throw new AudiframeError("INVALID_VALUE");
      return { id, value: values.get(id)! };
    });
  const synchronize = (changes: { id: string; value: number }[]) => {
    for (const change of changes) {
      const p = descriptors.find((p) => p.id === change.id);
      if (!p) throw new AudiframeError("INVALID_VALUE");
      validateParameter(p, change.value);
    }
    if (changes.some((c) => values.get(c.id) !== c.value)) {
      for (const c of changes) values.set(c.id, c.value);
      revision++;
    }
    return { values: get(changes.map((c) => c.id)), revision };
  };
  return {
    synchronize,
    handlers: {
      "parameters/list": () => ({ descriptors, revision }) as unknown as Json,
      "parameters/get": (payload: Json) => ({
        values: get((payload as { ids: string[] }).ids),
        revision,
      }),
      "parameters/set": async (payload: Json) => {
        const changes = (
          payload as unknown as { changes: { id: string; value: number }[] }
        ).changes;
        if (new Set(changes.map((c) => c.id)).size !== changes.length)
          throw new AudiframeError("INVALID_VALUE");
        for (const c of changes) {
          const p = descriptors.find((p) => p.id === c.id);
          if (!p || p.readOnly) throw new AudiframeError("INVALID_VALUE");
          validateParameter(p, c.value);
        }
        await apply(changes);
        for (const c of changes) values.set(c.id, c.value);
        revision++;
        return { values: get(changes.map((c) => c.id)), revision };
      },
    },
  };
}
