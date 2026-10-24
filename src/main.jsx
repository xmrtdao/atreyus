import { createRoot } from 'react-dom/client';
import AtreyusApp from './App';
import './index.css';

// ESC cancels any draft tool mode
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.dispatchEvent(new CustomEvent('atreyus:cancel-draft'));
  }
});

createRoot(document.getElementById('root')).render(<AtreyusApp />);
