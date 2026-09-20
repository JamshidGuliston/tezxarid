import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Address, AddressInput } from './models/address.models';

/** The signed-in user's saved addresses (JWT required by the backend). */
@Injectable({ providedIn: 'root' })
export class AddressesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/addresses/`;

  list(): Observable<Address[]> { return this.http.get<Address[]>(this.base); }
  create(input: AddressInput): Observable<Address> { return this.http.post<Address>(this.base, input); }
  update(id: number, patch: Partial<AddressInput>): Observable<Address> { return this.http.patch<Address>(`${this.base}${id}/`, patch); }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.base}${id}/`); }
}
