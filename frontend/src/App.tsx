import './App.css'
import { useState } from 'react';

interface FormResult {
  explanation: string;
  repo: string;
  timestamp: Date;
  cache: boolean;
}

function ResultDisplay({data} : {data: FormResult | null}) {
  if (!data) {
    return (
      <p>Processing the repo for you. Result will appear here once it's done.</p>
    );
  }
  return (
    <div>
      <h3>Submission Successful!</h3>
      <p>Status: {data.explanation}</p>
      <p>Repository: {data.repo}</p>
      <p>Time: {data.timestamp.toLocaleDateString()}</p>
    </div>
  );
}

function InputForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [resultData, setResultData] = useState<FormResult | null>(null);
  const [error, setError] = useState(null);

  async function query(formData: FormData) {
    setIsLoading(true);
    setResultData(null);
    setError(null);

    try {
      // parse the url for owner and repo name
      const query = formData.get("query") as string;
      
      const response = await fetch(``);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json(); // Convert the response body to a JavaScript object
      setResultData(data);

    } catch (err: Error) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
    

    setIsLoading(false);
    setResultData(null);
  }

  return (
    <div>
      <form action={query}>
        <input name='query' placeholder='Enter your GitHub Repo URL here'/>
        <button type="submit" disabled={isLoading}>
          { isLoading ? "Submitting" : "Explain" }
        </button>
      </form>

      {isLoading ? (
        <p>Loading results...</p>
      ) : (
        <ResultDisplay data={resultData} />
      )}
    </div>
  );
}

function App() {

  return (
    <>
      <h1>Welcome to Repo Explainer</h1>
      <InputForm />
    </>
  )
}

export default App
