import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Category, City, Product } from './models/catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getCities(): Observable<City[]> {
    return this.http.get<City[]>(`${this.base}/cities/`);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/categories/`);
  }

  getProducts(categoryId?: number, search?: string): Observable<Product[]> {
    let params = new HttpParams();
    if (categoryId != null) params = params.set('category', String(categoryId));
    if (search) params = params.set('search', search);
    return this.http.get<Product[]>(`${this.base}/products/`, { params });
  }
}
