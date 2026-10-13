// src/lib/holidays/yearList.ts
//
// Pure wording helper: [2020, 2021, 2022, 2024] -> "2020 to 2022, 2024". Used to tell the person which years the
// holiday calendar actually holds, whenever they ask about a year that is not loaded.

export function formatYearList(years: number[]): string {
  const ys = Array.from(new Set(years)).sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < ys.length) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    parts.push(j - i >= 1 ? `${ys[i]} to ${ys[j]}` : `${ys[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}
