import { expect,it,vi } from 'vitest';
import { SurfaceJobs } from '../../src/world/generation/SurfaceJobs';
import { createSurfaceBake,bakeSurfaceRows } from '../../src/world/generation/SurfaceBake';
const recipe={seed:3,kind:'rock',geography:4,activity:.5,ice:.3};
it('prioritizes visible worlds, rejects stale replies and bounds prefetch/cache/GPU ownership',()=>{
  const worker={onmessage:null as ((e:MessageEvent)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,postMessage:vi.fn(),terminate:vi.fn()};
  const jobs=new SurfaceJobs(true,()=>worker);
  for(let i=0;i<20;i++)jobs.prefetch({...recipe,seed:i+10});
  const key=jobs.acquire(recipe);jobs.pump();const first=worker.postMessage.mock.calls.at(-1)![0];expect(first.recipe.seed).toBe(3);
  jobs.release(key);jobs.pump();
  worker.onmessage!({data:{...first,...createSurfaceBake(256)}} as MessageEvent);expect(jobs.texture(key)).toBeNull();
  const current=worker.postMessage.mock.calls.at(-1)![0];worker.onmessage!({data:{...current,...createSurfaceBake(256)}} as MessageEvent);jobs.pump();
  expect(jobs.snapshot().entries).toBeLessThanOrEqual(6);expect(jobs.snapshot().estimatedBytes).toBeLessThan(jobs.snapshot().budgetBytes);expect(jobs.snapshot().cancelled).toBe(1);
  jobs.dispose();expect(worker.terminate).toHaveBeenCalledTimes(1);expect(jobs.snapshot().entries).toBe(0);
});
it('finishes an identical bounded fallback map when Worker is unavailable and frees once',()=>{
  const jobs=new SurfaceJobs(true,()=>{throw Error('No worker');}),key=jobs.acquire(recipe),second=jobs.acquire(recipe);
  for(let i=0;i<1000&&!jobs.texture(key);i++)jobs.pump();
  const texture=jobs.texture(key)!;expect(texture).not.toBeNull();expect(key).toBe(second);
  const expected=createSurfaceBake(256);bakeSurfaceRows(recipe,expected,0,expected.height);expect(texture.image.data).toEqual(expected.pixels);
  const disposed=vi.fn();texture.addEventListener('dispose',disposed);jobs.release(key);jobs.release(second);jobs.dispose();expect(disposed).toHaveBeenCalledTimes(1);
  expect(jobs.snapshot().mode).toBe('incremental-fallback');
});
