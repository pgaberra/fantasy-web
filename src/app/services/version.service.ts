import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Api } from '../api/api';
import { getVersions } from '../api/fn/versions/get-versions';
import { ServiceVersion } from '../api/models/service-version';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class VersionService {
  private readonly api = inject(Api);

  getVersions(): Observable<ServiceVersion[]> {
    return from(this.api.invoke(getVersions)).pipe(
      map((response) => [
        { name: 'fantasy-web', up: true, version: environment.version },
        ...response.services,
      ]),
    );
  }
}
