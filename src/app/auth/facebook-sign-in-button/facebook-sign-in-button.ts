import { afterNextRender, Component, inject, NgZone, output, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

interface FacebookAuthResponse {
  accessToken: string;
}

interface FacebookLoginResponse {
  authResponse?: FacebookAuthResponse;
}

interface FacebookSdk {
  init(config: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options?: { scope: string }): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';
const FB_GRAPH_VERSION = 'v21.0';

@Component({
  selector: 'app-facebook-sign-in-button',
  imports: [],
  templateUrl: './facebook-sign-in-button.html',
  styleUrl: './facebook-sign-in-button.css',
})
export class FacebookSignInButtonComponent {
  private readonly zone = inject(NgZone);

  readonly accessToken = output<string>();
  readonly appId = environment.facebookAppId;
  readonly loading = signal(false);

  constructor() {
    afterNextRender(() => {
      if (this.appId) {
        void this.loadSdk();
      }
    });
  }

  onLogin(): void {
    const fb = window.FB;
    if (!fb) {
      return;
    }
    this.loading.set(true);
    fb.login(
      (response) =>
        this.zone.run(() => {
          this.loading.set(false);
          const token = response.authResponse?.accessToken;
          if (token) {
            this.accessToken.emit(token);
          }
        }),
      { scope: 'email' },
    );
  }

  private loadSdk(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.FB) {
        resolve();
        return;
      }
      if (document.querySelector<HTMLScriptElement>(`script[src="${FB_SDK_SRC}"]`)) {
        resolve();
        return;
      }
      window.fbAsyncInit = () => {
        window.FB?.init({
          appId: this.appId,
          cookie: false,
          xfbml: false,
          version: FB_GRAPH_VERSION,
        });
        resolve();
      };
      const script = document.createElement('script');
      script.src = FB_SDK_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('error', () => reject(new Error('Failed to load the Facebook SDK')));
      document.head.appendChild(script);
    });
  }
}
