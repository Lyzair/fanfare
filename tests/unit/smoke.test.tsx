import { render, screen } from '@testing-library/preact';
import App from '../../src/ui/App';

test('App renders the product name', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sports Caller');
});
