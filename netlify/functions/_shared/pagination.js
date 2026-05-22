const DEFAULT_PAGE_SIZE = 1000;

export async function fetchAllPages(queryFactory, pageSize = DEFAULT_PAGE_SIZE) {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) return rows;
  }
}

export async function fetchExactCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
