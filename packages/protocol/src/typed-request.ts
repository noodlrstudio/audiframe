import type { Json } from "./types";
import type { Session, RequestOptions } from "./session";
import type {
  OperationInputs,
  OperationOutputs,
  RequestOperation,
} from "./generated";
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
