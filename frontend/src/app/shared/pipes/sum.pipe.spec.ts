import { SumPipe } from './sum.pipe';

describe('SumPipe', () => {
  const pipe = new SumPipe();

  it("formats a decimal string with thousands spaces and so'm suffix", () => {
    expect(pipe.transform('20400.00')).toBe("20 400 so'm");
  });

  it('formats a number', () => {
    expect(pipe.transform(464300)).toBe("464 300 so'm");
  });

  it('drops trailing .00 but keeps meaningful decimals', () => {
    expect(pipe.transform('4300.50')).toBe("4 300.5 so'm");
  });

  it('handles zero/empty gracefully', () => {
    expect(pipe.transform('0')).toBe("0 so'm");
    expect(pipe.transform(null)).toBe("0 so'm");
  });
});
