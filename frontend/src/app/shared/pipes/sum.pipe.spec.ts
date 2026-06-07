import { SumPipe } from './sum.pipe';

describe('SumPipe', () => {
  const pipe = new SumPipe();

  it('formats a decimal string with thousands spaces and сум suffix', () => {
    expect(pipe.transform('20400.00')).toBe('20 400 сум');
  });

  it('formats a number', () => {
    expect(pipe.transform(464300)).toBe('464 300 сум');
  });

  it('drops trailing .00 but keeps meaningful decimals', () => {
    expect(pipe.transform('4300.50')).toBe('4 300.5 сум');
  });

  it('handles zero/empty gracefully', () => {
    expect(pipe.transform('0')).toBe('0 сум');
    expect(pipe.transform(null)).toBe('0 сум');
  });
});
