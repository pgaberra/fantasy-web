import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  NgZone,
  output,
  viewChild,
} from '@angular/core';
import { environment } from '../../../environments/environment';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
}

interface GoogleIdentityServices {
  accounts: { id: GoogleAccountsId };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

@Component({
  selector: 'app-google-sign-in-button',
  imports: [],
  templateUrl: './google-sign-in-button.html',
  styleUrl: './google-sign-in-button.css',
})
export class GoogleSignInButtonComponent {
  private readonly zone = inject(NgZone);

  readonly credential = output<string>();
  readonly clientId = environment.googleClientId;

  private readonly buttonHost = viewChild<ElementRef<HTMLElement>>('buttonHost');

  constructor() {
    afterNextRender(() => {
      if (this.clientId) {
        void this.renderGoogleButton();
      }
    });
  }

  private async renderGoogleButton() {
    await this.loadGisScript();
    const host = this.buttonHost()?.nativeElement;
    const accountsId = window.google?.accounts.id;
    if (!host || !accountsId) {
      return;
    }
    accountsId.initialize({
      client_id: this.clientId,
      callback: (response) => this.zone.run(() => this.credential.emit(response.credential)),
    });
    accountsId.renderButton(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      logo_alignment: 'center',
      width: 320,
    });
  }

  private loadGisScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
      const script = existing ?? document.createElement('script');
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () =>
        reject(new Error('Failed to load Google Identity Services')),
      );
      if (!existing) {
        script.src = GIS_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }
}
