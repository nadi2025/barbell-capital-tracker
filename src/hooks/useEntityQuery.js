import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Shared cache-time/stale-time defaults for entity queries.
 * - staleTime: data considered fresh for 30s (avoids redundant fetches on fast navigation)
 * - refetchOnWindowFocus: true → when user returns to tab, get fresh data
 * - refetchInterval: 60s → auto-poll every minute
 */
const DEFAULT_QUERY_OPTIONS = {
  staleTime: 30 * 1000,
  refetchOnWindowFocus: true,
  refetchInterval: 60 * 1000,
  refetchIntervalInBackground: false,
  retry: 1,
};

/**
 * Generic hook for fetching a Base44 entity list.
 *
 * @param {string} entityName - e.g. "OptionsTrade", "StockPosition"
 * @param {Object} options
 * @param {string} [options.sort] - sort spec passed to entity.list (e.g. "-open_date")
 * @param {Object} [options.filter] - filter object (uses entity.filter instead of list when set)
 * @param {number} [options.limit]
 * @param {Object} [options.queryOptions] - override TanStack Query defaults
 * @returns TanStack Query result (data, isLoading, isFetching, error, refetch, ...)
 */
export function useEntityList(entityName, { sort, filter, limit, queryOptions } = {}) {
  return useQuery({
    queryKey: ["entity", entityName, { sort, filter, limit }],
    queryFn: async () => {
      const entity = base44.entities[entityName];
      if (!entity) throw new Error(`Unknown entity: ${entityName}`);
      if (filter) return entity.filter(filter, sort, limit);
      return entity.list(sort, limit);
    },
    ...DEFAULT_QUERY_OPTIONS,
    ...queryOptions,
  });
}

/**
 * Hook for invoking a Base44 function and caching the result.
 */
export function useFunction(functionName, payload = {}, queryOptions = {}) {
  return useQuery({
    queryKey: ["function", functionName, payload],
    queryFn: async () => {
      const res = await base44.functions.invoke(functionName, payload);
      return res?.data ?? res ?? null;
    },
    ...DEFAULT_QUERY_OPTIONS,
    ...queryOptions,
  });
}

/**
 * Mutation hook that automatically invalidates related entity queries on success.
 * Use this instead of direct base44.entities.X.update/create/delete calls so that
 * the dashboard (and any other consumer of the same entity) refreshes automatically.
 *
 * @param {string} entityName
 * @param {"create"|"update"|"delete"} action
 * @param {Object} [options]
 * @param {string[]} [options.invalidate] - extra entity names whose queries should also be invalidated
 */
export function useEntityMutation(entityName, action, { invalidate = [] } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args) => {
      const entity = base44.entities[entityName];
      if (!entity) throw new Error(`Unknown entity: ${entityName}`);
      if (action === "create") return entity.create(args);
      if (action === "update") return entity.update(args.id, args.data);
      if (action === "delete") return entity.delete(args);
      throw new Error(`Unknown mutation action: ${action}`);
    },
    onSuccess: () => {
      // Invalidate this entity + any extras (e.g. dashboard often depends on many entities)
      queryClient.invalidateQueries({ queryKey: ["entity", entityName] });
      invalidate.forEach((name) => {
        queryClient.invalidateQueries({ queryKey: ["entity", name] });
      });
      // Dashboard aggregate + functions like calculateAavePosition should refresh too
      queryClient.invalidateQueries({ queryKey: ["function"] });
    },
  });
}

/**
 * Force-refresh every entity query in the cache.
 * Useful after a "full update" operation (e.g. daily price refresh).
 */
export function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["entity"] });
    queryClient.invalidateQueries({ queryKey: ["function"] });
  };
}
