type SortableHostRow = {
  host: { host: string };
  metadata: { favorite: boolean };
};

export const sortRowsByFavoriteThenAlias = <TRow extends SortableHostRow>(rows: readonly TRow[]): TRow[] =>
  [...rows].sort((a, b) => {
    const favoriteCmp = Number(b.metadata.favorite) - Number(a.metadata.favorite);
    if (favoriteCmp !== 0) {
      return favoriteCmp;
    }
    return a.host.host.localeCompare(b.host.host);
  });
