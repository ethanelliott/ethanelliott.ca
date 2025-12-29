export function createProgressBar(total: number, label: string) {
  let current = 0;
  const barWidth = 20;
  let maxLineLength = 0;

  const render = () => {
    const percent = total === 0 ? 1 : current / total;
    const filled = Math.round(barWidth * percent);
    const bar = '='.repeat(filled).padEnd(barWidth, '-');
    const percentageText = (percent * 100).toFixed(1).padStart(6, ' ');
    const line = `${label} [${bar}] ${percentageText}% (${current}/${total})`;
    maxLineLength = Math.max(maxLineLength, line.length);
    const paddedLine = line.padEnd(maxLineLength, ' ');
    process.stdout.write(`\r${paddedLine}`);
    if (current === total) {
      process.stdout.write('\n');
    }
  };

  const tick = () => {
    current = Math.min(current + 1, total);
    render();
  };

  render();

  return tick;
}
