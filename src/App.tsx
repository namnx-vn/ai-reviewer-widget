import { reviewFiles } from "./review/reviewer";

import { ScoreCard } from "./components/ScoreCard";
import { FindingCard } from "./components/FindingCard";

const demoFiles = [
  {
    path: "src/remote/Checkout.tsx",

    content: `
      import Payment from "@remote/payment";

      export function Checkout() {
        console.log("checkout mounted");

        return <Payment />;
      }
    `,
  },

  {
    path: "src/utils/parser.ts",

    content: `
      export function parse(input: string) {
        return eval(input);
      }
    `,
  },
];

export default function App() {
  const result = reviewFiles(demoFiles);

  return (
    <main>
      <header>
        <p>AI ENGINEERING PLATFORM</p>

        <h1>
          Review code with
          <br />
          architectural context.
        </h1>

        <p>
          Deterministic AST analysis +
          architecture policies +
          AI reasoning.
        </p>
      </header>

      <ScoreCard score={result.score} />

      <section>
        <h2>Findings</h2>

        {result.findings.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
          />
        ))}
      </section>
    </main>
  );
}