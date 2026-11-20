import './styles/app.css';
import { App } from './app/App';
import { SettingsService } from './core/SettingsService';
import { setLocale } from './i18n';

async function bootstrap(): Promise<void> {
  const settings = await SettingsService.load();
  setLocale(settings.value.ui.locale);
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app root');
  new App(root, settings);
}

void bootstrap();
