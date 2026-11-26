import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';

import { useMediaStream } from './use-media-stream';

function fakeStream(): MediaStream {
  const track = { stop: jest.fn() } as unknown as MediaStreamTrack;
  return { getTracks: () => [track] } as unknown as MediaStream;
}

describe('useMediaStream', () => {
  it('acquires the stream on mount and reports ready', async () => {
    const stream = fakeStream();
    const acquire = jest.fn().mockResolvedValue(stream);
    const mapError = jest.fn();

    const { result } = renderHook(() => useMediaStream({ acquire, mapError }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.streamRef.current).toBe(stream);
  });

  it('attaches the stream to a video element when a videoRef is provided', async () => {
    const stream = fakeStream();
    const acquire = jest.fn().mockResolvedValue(stream);
    const videoRef = createRef<HTMLVideoElement>();
    (videoRef as { current: HTMLVideoElement }).current = document.createElement('video');

    renderHook(() => useMediaStream({ acquire, mapError: jest.fn(), videoRef }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(videoRef.current?.srcObject).toBe(stream);
  });

  it('maps a rejected acquire() into the error state', async () => {
    const acquire = jest.fn().mockRejectedValue(new Error('denied'));
    const mapError = jest.fn().mockReturnValue('Camera access was denied.');

    const { result } = renderHook(() => useMediaStream({ acquire, mapError }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBe('Camera access was denied.');
  });

  it('stops all tracks on unmount', async () => {
    const stream = fakeStream();
    const acquire = jest.fn().mockResolvedValue(stream);

    const { unmount } = renderHook(() => useMediaStream({ acquire, mapError: jest.fn() }));

    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('restart() re-acquires a fresh stream', async () => {
    const stream1 = fakeStream();
    const stream2 = fakeStream();
    const acquire = jest.fn().mockResolvedValueOnce(stream1).mockResolvedValueOnce(stream2);

    const { result } = renderHook(() => useMediaStream({ acquire, mapError: jest.fn() }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.streamRef.current).toBe(stream1);

    await act(async () => {
      result.current.restart();
      await Promise.resolve();
    });

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(result.current.streamRef.current).toBe(stream2);
  });
});
