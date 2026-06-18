import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// No StrictMode — the canvas engine doesn't tolerate double-mount in dev.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
