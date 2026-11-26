import { countTangoSolutions, generateTangoPuzzle } from './tango-generator';

type Symbol = 'SUN' | 'MOON';

function countInLine(line: Symbol[], value: Symbol): number {
  return line.filter((cell) => cell === value).length;
}

function hasThreeInARow(line: Symbol[]): boolean {
  return line.some((_, i) => i >= 2 && line[i] === line[i - 1] && line[i] === line[i - 2]);
}

function assertValidSolution(solution: Symbol[][], size: number) {
  for (let i = 0; i < size; i++) {
    const row = solution[i];
    const col = solution.map((r) => r[i]);
    expect(countInLine(row, 'SUN')).toBe(size / 2);
    expect(countInLine(row, 'MOON')).toBe(size / 2);
    expect(countInLine(col, 'SUN')).toBe(size / 2);
    expect(countInLine(col, 'MOON')).toBe(size / 2);
    expect(hasThreeInARow(row)).toBe(false);
    expect(hasThreeInARow(col)).toBe(false);
  }
}

describe('generateTangoPuzzle', () => {
  it.each([4, 6] as const)('produces a valid, fully-determined solution for a %ix%i grid', (size) => {
    const puzzle = generateTangoPuzzle(size, 'MED');
    expect(puzzle.size).toBe(size);
    assertValidSolution(puzzle.solution, size);
  });

  it('honors every declared constraint against the solution', () => {
    const puzzle = generateTangoPuzzle(6, 'MED');
    for (const constraint of puzzle.constraints) {
      const aValue = puzzle.solution[constraint.a[0]][constraint.a[1]];
      const bValue = puzzle.solution[constraint.b[0]][constraint.b[1]];
      const isEqual = aValue === bValue;
      expect(isEqual).toBe(constraint.type === 'EQUAL');
    }
  });

  it('leaves the puzzle grid consistent with the solution wherever a cell is given', () => {
    const puzzle = generateTangoPuzzle(6, 'MED');
    let emptyCount = 0;
    for (let row = 0; row < puzzle.size; row++) {
      for (let col = 0; col < puzzle.size; col++) {
        const cell = puzzle.grid[row][col];
        if (cell === 'EMPTY') {
          emptyCount++;
        } else {
          expect(cell).toBe(puzzle.solution[row][col]);
        }
      }
    }
    // A puzzle that's already fully given (no empties at all) wouldn't be a puzzle.
    expect(emptyCount).toBeGreaterThan(0);
  });

  it.each([4, 6] as const)('has exactly one solution for a %ix%i grid', (size) => {
    const puzzle = generateTangoPuzzle(size, 'MED');
    expect(countTangoSolutions(puzzle.grid, puzzle.constraints, size, 2)).toBe(1);
  });

  it('picks a title', () => {
    const puzzle = generateTangoPuzzle(4, 'LOW');
    expect(puzzle.title.length).toBeGreaterThan(0);
  });
});
