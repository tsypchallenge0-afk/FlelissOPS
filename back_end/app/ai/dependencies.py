import logging

logger = logging.getLogger(__name__)

# --- PANDAS & NUMPY ---
try:
    import pandas as pd
    import numpy as np
    PANDAS_AVAILABLE = True
    NUMPY_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    NUMPY_AVAILABLE = False
    logger.warning("Optional AI dependencies (pandas, numpy) missing.")
    
    class MockDataFrame:
        def __init__(self, *args, **kwargs):
            self.empty = True
            self.columns = []
        def sort_values(self, *args, **kwargs): return self
        def reset_index(self, *args, **kwargs): return self
        def dropna(self, *args, **kwargs): return self
        def set_index(self, *args, **kwargs): return self
        def __getitem__(self, key): return self
    
    class pd:
        DataFrame = MockDataFrame
        @staticmethod
        def to_datetime(arg, **kwargs): return arg
        @staticmethod
        def isna(arg): return False

    class MockRandom:
        @staticmethod
        def randint(*args, **kwargs): return 0
    
    class np:
        @staticmethod
        def nan(*args): return None
        @staticmethod
        def array(arg): return arg
        @staticmethod
        def ones(*args, **kwargs): return args[0]
        @staticmethod
        def clip(val, a, b): return val
        random = MockRandom

# --- PROPHET ---
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    logger.warning("Optional AI dependency (prophet) missing.")
    class Prophet:
        def __init__(self, *args, **kwargs): pass
        def fit(self, *args, **kwargs): return self
        def make_future_dataframe(self, *args, **kwargs): return MockDataFrame()
        def predict(self, *args, **kwargs): return MockDataFrame()

# --- SCIKIT-LEARN ---
try:
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("Optional AI dependency (scikit-learn) missing.")
    class IsolationForest:
        def __init__(self, *args, **kwargs): pass
        def fit(self, *args, **kwargs): return self
        def predict(self, *args, **kwargs): return []
    class StandardScaler:
        def __init__(self, *args, **kwargs): pass
        def fit(self, *args, **kwargs): return self
        def transform(self, *args, **kwargs): return args[0]
        def fit_transform(self, *args, **kwargs): return args[0]
