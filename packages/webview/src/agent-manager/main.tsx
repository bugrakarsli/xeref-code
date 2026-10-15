import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles/theme.css';
import '../styles/ui.css';

createRoot(document.getElementById('root')!).render(<App />);
