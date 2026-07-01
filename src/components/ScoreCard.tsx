interface ScoreCardProps {
  score: number;
}

export function ScoreCard({ score }: ScoreCardProps) {
  return (
    <section>
      <span>Review Score</span>

      <strong>{score}</strong>

      <span>/ 100</span>
    </section>
  );
}
