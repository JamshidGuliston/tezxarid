import { TestBed } from '@angular/core/testing';
import { QtyStepper } from './qty-stepper';

describe('QtyStepper', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [QtyStepper] }));

  it('emits inc/dec when the buttons are clicked', async () => {
    const fixture = TestBed.createComponent(QtyStepper);
    fixture.componentRef.setInput('qty', 1);
    fixture.componentRef.setInput('unit', 'kg');
    let incd = 0, decd = 0;
    fixture.componentInstance.inc.subscribe(() => incd++);
    fixture.componentInstance.dec.subscribe(() => decd++);
    await fixture.whenStable();
    const btns = fixture.nativeElement.querySelectorAll('button');
    btns[0].click();
    btns[1].click();
    expect(decd).toBe(1);
    expect(incd).toBe(1);
  });

  it('renders the qty and unit label', async () => {
    const fixture = TestBed.createComponent(QtyStepper);
    fixture.componentRef.setInput('qty', 3);
    fixture.componentRef.setInput('unit', 'kg');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('3');
    expect(fixture.nativeElement.textContent).toContain('кг');
  });
});
