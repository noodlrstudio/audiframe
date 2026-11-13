import type { Json } from "./types.js";
import type { Session, RequestOptions } from "./session.js";
import type {
  OperationInputs,
  OperationOutputs,
  RequestOperation,
} from "./generated.js";
export function requestOperation<K extends RequestOperation>(
  session: Pick<Session, "request">,
  type: K,
  payload: OperationInputs[K],
  options?: RequestOptions,
): Promise<OperationOutputs[K]> {
  return session.request<OperationOutputs[K]>(
    type,
    payload as unknown as Json,
    options,
  );
}
