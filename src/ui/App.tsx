import { demoReviewResult } from "./fixtures/demo-review-result";
import { ReviewDashboard } from "./review-dashboard";

export default function App() {
  return <ReviewDashboard result={demoReviewResult} />;
}
