import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OperatorStore } from './operator.store';

/** The console is on the public site: without an operator session, go to its login page. */
export const operatorGuard: CanActivateFn = () =>
  inject(OperatorStore).isOperator() ? true : inject(Router).parseUrl('/order-admin/login');
