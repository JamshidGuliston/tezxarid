import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OrdersApi } from './orders-api';
import { OrderCreatePayload } from './models/order.models';

describe('OrdersApi', () => {
  let api: OrdersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [OrdersApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OrdersApi);
    http = TestBed.inject(HttpTestingController);
  });

  it('getDeliverySlots hits /api/delivery-slots/', () => {
    api.getDeliverySlots().subscribe();
    const req = http.expectOne('http://localhost:8000/api/delivery-slots/');
    expect(req.request.method).toBe('GET');
    req.flush([]);
    http.verify();
  });

  it('createOrder POSTs the payload to /api/orders/', () => {
    const payload: OrderCreatePayload = {
      customer_name: 'Aziz', phone: '+998901234567', address: 'Chilonzor 5', comment: '',
      payment_type: 'cash', delivery_date: '2026-09-13', delivery_slot_id: 4,
      items: [{ city_product: 11, qty: '1' }],
    };
    api.createOrder(payload).subscribe();
    const req = http.expectOne('http://localhost:8000/api/orders/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({}, { status: 201, statusText: 'Created' });
    http.verify();
  });
});
