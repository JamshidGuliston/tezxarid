import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Me, MePatch, TokenPair } from './models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  telegram(initData: string): Observable<TokenPair> {
    return this.http.post<TokenPair>(`${this.base}/auth/telegram/`, { init_data: initData });
  }

  refresh(refresh: string): Observable<{ access: string }> {
    return this.http.post<{ access: string }>(`${this.base}/auth/token/refresh/`, { refresh });
  }

  me(): Observable<Me> {
    return this.http.get<Me>(`${this.base}/auth/me/`);
  }

  updateMe(patch: MePatch): Observable<Me> {
    return this.http.patch<Me>(`${this.base}/auth/me/`, patch);
  }
}
