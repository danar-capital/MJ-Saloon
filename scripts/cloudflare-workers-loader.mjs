export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: "data:text/javascript,export const env = {}; export const waitUntil = (promise) => void Promise.resolve(promise); export class WorkerEntrypoint {}; export class DurableObject {}; export class WorkflowEntrypoint {};",
      shortCircuit: true,
    };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier) && context.parentURL?.startsWith("file:")) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
