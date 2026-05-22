# Debug: Terms & Profile Setup Not Appearing After Verification

## Files Status
✅ Both files exist and are properly created:
- `app/(auth)/terms.tsx` - 248 lines
- `app/(auth)/profile-setup.tsx` - 568 lines
- Routing in `verify.tsx` is correctly set to navigate to `/(auth)/terms`

## Try These Steps in Order

### 1. Clear Expo Cache & Rebuild
```bash
# Clear cache and restart
npx expo start -c
# or
npx expo start --clear
```

### 2. Clear Node Modules (if above doesn't work)
```bash
rm -r node_modules
npm install
npx expo start -c
```

### 3. Clear Device Cache (if testing on device)
- Close the app completely
- Clear app data in device settings
- Reopen the app and try signing up again

### 4. Test on Web First
```bash
npx expo start --web
```
This is faster for debugging. Verify the flow works on web before testing on mobile.

## What to Look For During Testing

1. **After signup with email:**
   - You should see verification screen
   - Check your email inbox for verification link

2. **After clicking link in email:**
   - Click "I've Clicked the Link" button
   - You should be taken to **Terms & Conditions screen**
   - If nothing happens, check browser console for errors

3. **After accepting terms:**
   - Checkbox must be checked
   - "Accept & Continue" button should become active
   - Click it to go to **Profile Setup**

4. **Profile setup flow:**
   - 5-step wizard: Name → Photo → Phone → Location → Bio
   - "Finish" button on final step should save and go to Home

## If Still Not Working

Check console for these error messages:
- "Cannot find module" → File path issue
- "Navigation failed" → Routing problem
- "ReferenceError" → Code syntax error

## Current Routing Chain
```
Signup 
  ↓
Verify Email 
  ↓ (email verified)
Terms & Conditions ← ← ← STEP 1
  ↓ (accept terms)
Profile Setup ← ← ← STEP 2
  ↓ (finish)
Home Tabs
```

If you see verification screen but nothing after, the issue is at "STEP 1 - Terms & Conditions" routing.
