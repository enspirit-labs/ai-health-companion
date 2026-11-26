import { cameraErrorMessage, microphoneErrorMessage } from './user-media';

describe('cameraErrorMessage', () => {
  it('classifies a declined permission as denied', () => {
    const error = cameraErrorMessage(new DOMException('nope', 'NotAllowedError'));
    expect(error.kind).toBe('denied');
    expect(error.message).toMatch(/camera access was denied/i);
  });

  it('classifies a missing device as unavailable', () => {
    const error = cameraErrorMessage(new DOMException('nope', 'NotFoundError'));
    expect(error.kind).toBe('unavailable');
    expect(error.message).toMatch(/no camera was found/i);
  });

  it('classifies an insecure context distinctly', () => {
    const error = cameraErrorMessage(
      new Error('This requires a secure connection (HTTPS or localhost) and browser permission.'),
    );
    expect(error.kind).toBe('insecure');
    expect(error.message).toMatch(/secure connection/i);
  });

  it('falls back to unavailable for an unrecognized error', () => {
    const error = cameraErrorMessage(new Error('something else'));
    expect(error.kind).toBe('unavailable');
  });
});

describe('microphoneErrorMessage', () => {
  it('mentions the microphone specifically', () => {
    const error = microphoneErrorMessage(new DOMException('nope', 'NotAllowedError'));
    expect(error.message).toMatch(/microphone access was denied/i);
  });
});
