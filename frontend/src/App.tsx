import './App.css';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { InputForm } from './components/InputForm';

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <div className="hero-section">
          <h1 className="main-title">
            <span className="sparkle sparkle-left">✨</span>
            <span className="title-text">Understand any repository</span>
            <span className="sparkle sparkle-right">✨</span>
          </h1>
          <div className="description">
            <p>Get AI explanations of any GitHub repository quickly.</p>
            <p>This is useful for high-level understanding of any codebase.</p>
          </div>
        </div>
        <InputForm />
      </main>
      <Footer />
    </div>
  );
}

export default App;
