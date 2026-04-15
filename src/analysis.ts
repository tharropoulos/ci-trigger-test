import { MemoryDiagnosticCollector } from "./diagnostics.js";
import { ParameterCollector, collectPathParams } from "./analysis/collector.js";
import { createDebugLogger } from "./analysis/debug.js";
import { analyzeFunction } from "./analysis/traversal.js";
import type {
  AliasTarget,
  DebugConfig,
  ExtractionContext,
  FunctionDefinition,
  RouteExtraction,
  RouteRegistration,
} from "./types.js";

export function extractRouteData(
  route: RouteRegistration,
  functions: ReadonlyMap<string, FunctionDefinition>,
  constants: ReadonlyMap<string, string>,
  maxCallDepth: number,
  debugConfig: DebugConfig,
): RouteExtraction {
  const diagnostics = new MemoryDiagnosticCollector();
  const definition = functions.get(route.handler);
  const routeKey = `${route.method} ${route.pathTemplate}`;
  const debug = createDebugLogger(routeKey, debugConfig);

  if (definition === undefined) {
    diagnostics.add({
      level: "error",
      code: "handler_not_found",
      message: `Could not find function body for handler ${route.handler}.`,
      routeKey,
      source: route.source,
    });
    return {
      route,
      pathParams: collectPathParams(route),
      queryParams: [],
      bodyParams: [],
      diagnostics: diagnostics.snapshot(),
    };
  }

  const context: ExtractionContext = {
    aliasTargets: new Map<string, AliasTarget>(),
    constants,
    functions,
    diagnostics,
    maxCallDepth,
    pathParamNames: new Set(
      collectPathParams(route).map((parameter) => parameter.canonicalPath),
    ),
  };

  const collector = new ParameterCollector();
  const visited = new Set<string>();
  analyzeFunction(definition, context, collector, visited, 0, routeKey, debug);
  debug(
    `query params => ${
      collector
        .snapshot("query")
        .map((item) => item.canonicalPath)
        .join(", ") || "(none)"
    }`,
  );
  debug(
    `body params => ${
      collector
        .snapshot("body")
        .map((item) => item.canonicalPath)
        .join(", ") || "(none)"
    }`,
  );

  return {
    route,
    pathParams: collectPathParams(route),
    queryParams: collector.snapshot("query"),
    bodyParams: collector.snapshot("body"),
    diagnostics: diagnostics.snapshot(),
  };
}
