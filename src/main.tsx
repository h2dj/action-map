import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { autosave, session } from './runtime';

const root = createRoot(document.getElementById('root')!);

session.start().then((result) => {
  // 탭을 닫거나 숨길 때 남은 변경을 저장한다
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosave.flush();
  });
  window.addEventListener('pagehide', () => void autosave.flush());
  root.render(
    <StrictMode>
      <App startupWarning={result.warning} />
    </StrictMode>,
  );
});
