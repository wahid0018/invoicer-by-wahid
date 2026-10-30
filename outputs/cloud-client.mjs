import { createClient } from '@supabase/supabase-js';

(() => {
  const config = window.INVOICER_CLOUD_CONFIG || {};
  const enabled = Boolean(config.url && config.anonKey);
  const USER_KEY = 'invoicer.auth.users';
  const SESSION_KEY = 'invoicer.auth.session';
  let currentUser = null;
  let currentCompany = null;
  let membershipRows = [];
  let currentSession = null;
  let channel = null;
  let suppressWrites = false;
  let activePrefix = '';
  const versions = new Map();
  const pendingWrites = new Map();
  const timers = new Map();
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const client = enabled ? createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  }) : null;

  const cloud = {
    enabled,
    client,
    get user() { return currentUser; },
    get company() { return currentCompany; },
    get memberships() { return membershipRows; },
    get session() { return currentSession; },
    get currentUser() { return currentUser; },
    get currentCompany() { return currentCompany; },
    ready: Promise.resolve(null),
    signOut,
    switchCompany,
    createCompany,
    refresh: () => currentSession ? loadCompanyRecords(currentSession) : Promise.resolve(false)
  };
  window.invoicerCloud = cloud;

  function showError(form, message) {
    const output = form?.querySelector('.auth-error');
    if (output) output.textContent = message;
  }

  function localUsers() {
    try {
      const rows = JSON.parse(localStorage.getItem(USER_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }

  function storeCloudUser(user, profile) {
    const local = localUsers().filter(item => item.id !== user.id);
    const row = {
      id: user.id,
      name: profile.full_name || user.user_metadata?.full_name || user.email || 'User',
      email: user.email || profile.email || '',
      mobile: profile.mobile || user.user_metadata?.mobile || '',
      address: profile.address || user.user_metadata?.address || '',
      status: 'active', plan: 'free', licenseId: null,
      companyIds: membershipRows.map(item => item.company_id), createdAt: user.created_at
    };
    local.push(row);
    originalSetItem.call(localStorage, USER_KEY, JSON.stringify(local));
    currentUser = row;
  }

  async function loadMemberships(userId) {
    const { data, error } = await client.from('company_members')
      .select('company_id,role,created_at,companies(id,name,gstin,pan,email,phone,address,city,state_code,pincode,bank_name,bank_account_number,bank_ifsc,bank_branch,upi_id,default_terms,settings,theme_key,invoice_prefix,invoice_suffix,next_invoice_number)')
      .eq('user_id', userId).order('created_at', { ascending: true });
    if (error) throw error;
    membershipRows = (data || []).filter(row => row.companies);
    if (!membershipRows.length) throw new Error('This account has no company yet. Apply the Supabase signup migration, then sign in again.');
    const saved = (() => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } })();
    const active = membershipRows.find(row => row.company_id === saved?.companyId) || membershipRows[0];
    currentCompany = active.companies;
    currentCompany.id = active.company_id;
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('full_name,email,mobile,address').eq('id', userId).single();
    if (profileError) throw profileError;
    storeCloudUser(currentSession.user, profile || {});
    const session = { role: 'user', userId, companyId: currentCompany.id, cloud: true };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    activePrefix = `invoicer.data.${userId}.${currentCompany.id}.`;
    await loadCompanyRecords(currentSession);
    subscribeToCompany(currentCompany.id);
    return session;
  }

  function companyDefaults(company) {
    const key = activePrefix + 'company';
    if (!localStorage.getItem(key)) originalSetItem.call(localStorage, key, JSON.stringify({
      name: company.name || 'My Company', gstin: company.gstin || '', pan: company.pan || '',
      email: company.email || currentUser?.email || '', phone: company.phone || currentUser?.mobile || '',
      address: company.address || currentUser?.address || '', city: company.city || '', state: company.state_code || '09',
      pincode: company.pincode || '', bankName: company.bank_name || '', accountNumber: company.bank_account_number || '',
      ifsc: company.bank_ifsc || '', branch: company.bank_branch || '', upi: company.upi_id || '',
      terms: company.default_terms || '', remark: ''
    }));
    const settingsKey = activePrefix + 'invoiceSettings';
    if (!localStorage.getItem(settingsKey)) originalSetItem.call(localStorage, settingsKey, JSON.stringify({
      pageSize: 'A4', parcelSize: 'A6', marginTop: 10, marginRight: 10, marginBottom: 10, marginLeft: 10,
      prefix: company.invoice_prefix || '', suffix: company.invoice_suffix || '', copies: ['Customer', 'Office'],
      selectedPrintCopies: ['Customer', 'Office'], lineDiscount: true, autoRoundoff: true,
      enableItemDetails: false, showItemDetails: true, theme: 'light', colorTheme: company.theme_key || 'emerald',
      printTemplate: 'modern', defaultPaymentTerms: company.default_terms || '30 days', tallyPrintFontSize: 11
    }));
  }

  async function loadCompanyRecords(session) {
    const companyId = currentCompany?.id;
    if (!companyId || !session?.access_token) return false;
    const { data, error } = await client.from('company_records')
      .select('record_key,record_value,version').eq('company_id', companyId);
    if (error) throw error;
    const remoteRows = data || [];
    const prefix = `invoicer.data.${session.user.id}.${companyId}.`;
    activePrefix = prefix;
    suppressWrites = true;
    try {
      if (remoteRows.length) {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(prefix)) originalRemoveItem.call(localStorage, key);
        }
      }
      versions.clear();
      for (const row of remoteRows) {
        versions.set(row.record_key, Number(row.version));
        originalSetItem.call(localStorage, prefix + row.record_key, row.record_value);
      }
      companyDefaults(currentCompany);
    } finally { suppressWrites = false; }
    return true;
  }

  function recordKey(key) {
    if (!activePrefix || !key.startsWith(activePrefix)) return null;
    return key.slice(activePrefix.length);
  }

  function queueRecordWrite(key, value, remove = false) {
    const record = recordKey(key);
    if (!record || suppressWrites || !currentCompany || !currentSession) return;
    pendingWrites.set(record, { value, remove });
    clearTimeout(timers.get(record));
    timers.set(record, setTimeout(() => flushRecordWrite(record).catch(error => {
      console.error('Cloud save failed:', error);
      window.toast?.(error.message || 'Cloud save failed. Your change is still on this device.');
    }), 180));
  }

  async function flushRecordWrite(record) {
    const pending = pendingWrites.get(record);
    if (!pending || !currentCompany || !currentSession) return;
    pendingWrites.delete(record);
    if (pending.remove) {
      const version = versions.get(record);
      let request = client.from('company_records').delete().eq('company_id', currentCompany.id).eq('record_key', record);
      if (version) request = request.eq('version', version);
      const { error } = await request;
      if (error) throw error;
      versions.delete(record);
      return;
    }
    const expectedVersion = versions.get(record) || 0;
    const { data, error } = await client.rpc('save_company_record', {
      target_company: currentCompany.id,
      target_key: record,
      target_value: String(pending.value),
      expected_version: expectedVersion
    });
    if (error) throw new Error(error.code === '40001' ? 'This record changed on another device. Reload cloud data before editing it again.' : error.message);
    versions.set(record, Number(data));
  }

  async function subscribeToCompany(companyId) {
    if (channel) await client.removeChannel(channel);
    channel = client.channel(`company-records-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_records', filter: `company_id=eq.${companyId}` }, event => {
        const row = event.new?.record_key ? event.new : event.old;
        if (!row?.record_key || pendingWrites.has(row.record_key)) return;
        const nextVersion = Number(event.new?.version || 0);
        if (event.eventType !== 'DELETE' && nextVersion <= (versions.get(row.record_key) || 0)) return;
        suppressWrites = true;
        try {
          const key = activePrefix + row.record_key;
          if (event.eventType === 'DELETE') { originalRemoveItem.call(localStorage, key); versions.delete(row.record_key); }
          else { originalSetItem.call(localStorage, key, event.new.record_value); versions.set(row.record_key, nextVersion); }
        } finally { suppressWrites = false; }
      }).subscribe();
  }

  async function loadWorkspace(session) {
    currentSession = session;
    await loadMemberships(session.user.id);
    return currentUser;
  }

  async function signOut() {
    if (client) await client.auth.signOut();
    currentSession = null; currentUser = null; currentCompany = null; membershipRows = [];
    activePrefix = ''; versions.clear();
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  }

  async function switchCompany(companyId) {
    const match = membershipRows.find(row => row.company_id === companyId);
    if (!match) throw new Error('You do not have access to that company.');
    currentCompany = match.companies;
    currentCompany.id = match.company_id;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'user', userId: currentUser.id, companyId, cloud: true }));
    await loadCompanyRecords(currentSession);
    window.location.reload();
  }

  async function createCompany(name) {
    const { data, error } = await client.rpc('create_company_for_current_user', { target_name: name });
    if (error) throw error;
    const { data: membership, error: membershipError } = await client.from('company_members')
      .select('company_id,role,created_at,companies(id,name,gstin,pan,email,phone,address,city,state_code,pincode,bank_name,bank_account_number,bank_ifsc,bank_branch,upi_id,default_terms,settings,theme_key,invoice_prefix,invoice_suffix,next_invoice_number)')
      .eq('company_id', data).eq('user_id', currentUser.id).single();
    if (membershipError) throw membershipError;
    membershipRows.push(membership);
    currentUser.companyIds = membershipRows.map(row => row.company_id);
    const users = localUsers().map(row => row.id === currentUser.id ? currentUser : row);
    originalSetItem.call(localStorage, USER_KEY, JSON.stringify(users));
    await switchCompany(data);
  }

  async function authenticate(event) {
    const form = event.target;
    if (!['loginForm', 'signupForm', 'adminLoginForm'].includes(form?.id)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!enabled) { showError(form, 'Cloud sign-in is not configured yet. Connect this app to a Supabase project.'); return; }
    if (form.id === 'adminLoginForm') { showError(form, 'Administrator actions must be configured as protected server functions.'); return; }
    const button = form.querySelector('button[type="submit"],button:not([type])');
    if (button) button.disabled = true;
    showError(form, '');
    try {
      const fields = new FormData(form);
      if (form.id === 'loginForm') {
        const { data, error } = await client.auth.signInWithPassword({
          email: String(fields.get('email') || '').trim(), password: String(fields.get('password') || '')
        });
        if (error) throw error;
        await loadWorkspace(data.session);
        window.location.reload();
        return;
      }
      const { data, error } = await client.auth.signUp({
        email: String(fields.get('email') || '').trim(), password: String(fields.get('password') || ''),
        options: { data: {
          full_name: String(fields.get('name') || '').trim(), mobile: String(fields.get('mobile') || '').trim(),
          address: String(fields.get('address') || '').trim()
        } }
      });
      if (error) throw error;
      if (!data.session) {
        showError(form, 'Check your email to confirm the account, then sign in.');
        return;
      }
      await loadWorkspace(data.session);
      window.location.reload();
    } catch (error) {
      showError(form, error.message || 'Could not connect to the cloud account.');
    } finally { if (button && document.contains(button)) button.disabled = false; }
  }

  document.addEventListener('submit', authenticate, true);
  document.addEventListener('click', event => {
    const logoutButton = event.target.closest('[onclick*="logout"]');
    if (!logoutButton || !enabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    signOut().catch(error => window.toast?.(error.message || 'Could not sign out.'));
  }, true);

  if (enabled) {
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) {
      const result = originalSet.call(this, key, value);
      if (this === localStorage) queueRecordWrite(String(key), String(value));
      return result;
    };
    Storage.prototype.removeItem = function(key) {
      const result = originalRemove.call(this, key);
      if (this === localStorage) queueRecordWrite(String(key), null, true);
      return result;
    };
    cloud.ready = (async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session) await loadWorkspace(data.session);
      return currentUser;
    })().catch(error => {
      console.error('Cloud initialization failed:', error);
      cloud.initializationError = error.message;
      return null;
    });
    client.auth.onAuthStateChange((_event, session) => {
      if (!session) { currentSession = null; currentUser = null; currentCompany = null; }
    });
  }
})();
