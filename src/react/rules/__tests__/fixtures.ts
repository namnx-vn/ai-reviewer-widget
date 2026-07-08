/** Named regression samples shared by React rule tests. */
export const missingDependencyRegression = `
  function Counter({ count }) {
    useEffect(() => {
      console.log(count);
    }, []);
  }
`;

export const memoWithoutPropsRegression = `
  const StaticCard = memo(() => <div>static</div>);
`;
